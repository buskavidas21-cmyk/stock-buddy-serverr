import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import User from '../models/User';
import Manager from '../models/Manager';
import { sendEmail } from './emailService';

type UserRole = 'super_admin' | 'admin' | 'staff' | 'audits';
export type NotificationEventType = 'stock' | 'repair' | 'disposal' | 'transfer';

interface NotificationOptions {
  title: string;
  message: string;
  data?: Record<string, unknown>;
  roles?: UserRole[];
  locationId?: string;
  eventType?: NotificationEventType;
  notifyAdmins?: boolean;
  emailSubject?: string;
  emailHtml?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    encoding: string;
    cid?: string;
  }>;
}

const getServiceAccount = () => {
  if (!process.env.FCM_SERVICE_ACCOUNT) {
    throw new Error(
      'FCM_SERVICE_ACCOUNT environment variable is required. ' +
      'Please set it in your environment variables with the Firebase service account JSON as a single-line string.'
    );
  }

  try {
    const serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT);
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter((field) => !serviceAccount[field]);
    if (missingFields.length > 0) {
      throw new Error(`FCM_SERVICE_ACCOUNT is missing required fields: ${missingFields.join(', ')}`);
    }
    return serviceAccount;
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(
        'Failed to parse FCM_SERVICE_ACCOUNT. Make sure it is valid JSON: ' + error.message
      );
    }
    throw error;
  }
};

const serviceAccount = getServiceAccount();

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/firebase.messaging',
    ],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error('Failed to get access token');
  }
  return tokenResponse.token;
}

const sendFCMNotification = async (
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) => {
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

  const fcmData: Record<string, string> = {};
  if (data) {
    Object.keys(data).forEach((key) => {
      fcmData[key] = String(data[key]);
    });
  }

  const payload = {
    message: {
      token,
      notification: { body, title },
      data: fcmData,
    },
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
};

const sendPushNotifications = async (
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) => {
  if (!tokens.length) return;

  await Promise.all(
    tokens.map((token) =>
      sendFCMNotification(token, title, body, data).catch((error) => {
        console.error(`Failed to send notification to token ${token.substring(0, 20)}...:`, error.message);
        return null;
      })
    )
  );
};

const sendEmailNotifications = async (
  emails: string[],
  subject: string,
  html: string,
  attachments?: NotificationOptions['attachments']
) => {
  if (!emails.length) return;

  try {
    await sendEmail({
      to: process.env.EMAIL_USER,
      bcc: emails,
      subject,
      html,
      attachments,
    });
  } catch (error) {
    console.error('Failed to send email notifications:', error);
  }
};

const getManagersForLocation = async (locationId: string, eventType?: NotificationEventType) => {
  const managers = await Manager.find({
    isActive: true,
    assignedLocationIds: locationId,
  }).select('email notificationPreferences');

  if (!eventType) {
    return managers;
  }

  const prefKey = eventType as keyof typeof managers[0]['notificationPreferences'];
  return managers.filter((m) => m.notificationPreferences?.[prefKey] !== false);
};

export const notifyUsers = async ({
  title,
  message,
  data,
  roles,
  locationId,
  eventType,
  notifyAdmins = true,
  emailSubject,
  emailHtml,
  attachments,
}: NotificationOptions) => {
  const userFilter: Record<string, unknown> = { isActive: true };
  const adminRoles: UserRole[] = ['admin', 'super_admin'];

  if (roles?.length) {
    userFilter.role = { $in: roles };
  } else if (notifyAdmins) {
    userFilter.role = { $in: adminRoles };
  }

  const users = locationId && eventType && !roles?.length && !notifyAdmins
    ? []
    : await User.find(userFilter).select('email noti role');

  const managerDocs = locationId
    ? await getManagersForLocation(locationId, eventType)
    : [];

  const pushTokens = users
    .map((user) => user.noti)
    .filter((token): token is string => Boolean(token));

  const userEmails = users.map((user) => user.email).filter((email): email is string => Boolean(email));
  const managerEmails = managerDocs
    .map((m) => m.email)
    .filter((email): email is string => Boolean(email));

  const emails = [...new Set([...userEmails, ...managerEmails])];

  if (pushTokens.length > 0) {
    await sendPushNotifications(pushTokens, title, message, data).catch((error) => {
      console.error('Failed to send push notifications:', error);
    });
  }

  if (emailSubject && emailHtml && emails.length > 0) {
    await sendEmailNotifications(emails, emailSubject, emailHtml, attachments).catch((error) => {
      console.error('Failed to send email notifications:', error);
    });
  }
};
