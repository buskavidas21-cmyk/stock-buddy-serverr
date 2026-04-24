import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Transaction from '../models/Transaction';
import Item from '../models/Item';

const ITEM_POPULATE_SELECT = 'name sku modelNumber serialNumber purchaseDate unit';

const TRANSACTION_CATEGORY = {
  all: null as string | null,
  sent_repair: 'REPAIR_OUT',
  returned_repair: 'REPAIR_IN',
  transfers: 'TRANSFER',
  disposed: 'DISPOSE',
  add: 'ADD'
} as const;

type CategoryKey = keyof typeof TRANSACTION_CATEGORY;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const parseAnchor = (input?: string): Date => {
  if (!input) return new Date();
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const rangeForDatePreset = (
  anchor: Date,
  preset: 'day' | 'week' | 'month' | 'year'
): { start: Date; end: Date } => {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const day = anchor.getUTCDate();

  if (preset === 'day') {
    const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
    return { start, end };
  }

  if (preset === 'month') {
    const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    return { start, end };
  }

  if (preset === 'year') {
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    return { start, end };
  }

  // Week: Monday (ISO-style) as start in UTC calendar date
  const dow = anchor.getUTCDay();
  const diffToMonday = (dow + 6) % 7;
  const start = new Date(Date.UTC(y, m, day - diffToMonday, 0, 0, 0, 0));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
};

export const buildTransactionQuery = async (query: Record<string, unknown>) => {
  const filter: Record<string, unknown> = {};

  const rawCategory = (query.category as string) || '';
  const category = (TRANSACTION_CATEGORY as Record<string, string | null>)[rawCategory] ?? undefined;

  if (rawCategory && rawCategory !== 'all') {
    if (category === undefined) {
      throw new Error('Invalid category filter');
    }
    filter.type = category;
  }

  const type = query.type as string | undefined;
  if (type && !rawCategory) {
    const allowed = ['ADD', 'TRANSFER', 'REPAIR_OUT', 'REPAIR_IN', 'DISPOSE'];
    if (!allowed.includes(type)) {
      throw new Error('Invalid transaction type');
    }
    filter.type = type;
  }

  const status = query.status as string | undefined;
  if (status) {
    const allowedStatus = ['pending', 'approved', 'rejected'];
    if (!allowedStatus.includes(status)) {
      throw new Error('Invalid status filter');
    }
    filter.status = status;
  }

  let startDate = query.startDate ? new Date(query.startDate as string) : undefined;
  let endDate = query.endDate ? new Date(query.endDate as string) : undefined;

  const datePreset = query.datePreset as string | undefined;
  if (datePreset) {
    const allowedPresets = ['day', 'week', 'month', 'year'] as const;
    if (!allowedPresets.includes(datePreset as (typeof allowedPresets)[number])) {
      throw new Error('Invalid datePreset');
    }
    const anchor = parseAnchor(query.anchorDate as string | undefined);
    const range = rangeForDatePreset(anchor, datePreset as (typeof allowedPresets)[number]);
    startDate = range.start;
    endDate = range.end;
  }

  if (startDate && Number.isNaN(startDate.getTime())) {
    throw new Error('Invalid startDate');
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid endDate');
  }

  if (startDate || endDate) {
    const createdAt: Record<string, Date> = {};
    if (startDate) createdAt.$gte = startDate;
    if (endDate) createdAt.$lte = endDate;
    filter.createdAt = createdAt;
  }

  const search = (query.search as string | undefined)?.trim();
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const itemMatches = await Item.find({
      $or: [
        { name: regex },
        { sku: regex },
        { modelNumber: regex },
        { serialNumber: regex },
        { barcode: regex }
      ]
    })
      .select('_id')
      .lean();

    const itemIds = itemMatches.map((i) => i._id);

    filter.$or = [
      { note: regex },
      { vendorName: regex },
      { serialNumber: regex },
      ...(itemIds.length ? [{ itemId: { $in: itemIds } }] : [])
    ];
  }

  return filter;
};

export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

    let filter: Record<string, unknown>;
    try {
      filter = await buildTransactionQuery(req.query as Record<string, unknown>);
    } catch (e: any) {
      return res.status(400).json({ error: e.message || 'Invalid query parameters' });
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('itemId', ITEM_POPULATE_SELECT)
        .populate('fromLocationId', 'name')
        .populate('toLocationId', 'name')
        .populate('createdBy', 'name email')
        .populate('approvedBy', 'name')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip((pageNum - 1) * limitNum)
        .lean(),
      Transaction.countDocuments(filter)
    ]);

    res.json({
      transactions,
      filters: {
        category: (req.query.category as CategoryKey) || 'all',
        type: req.query.type,
        status: req.query.status,
        datePreset: req.query.datePreset,
        anchorDate: req.query.anchorDate,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

export const getTransactionById = async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('itemId', ITEM_POPULATE_SELECT)
      .populate('fromLocationId', 'name')
      .populate('toLocationId', 'name')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
};

export const patchRepairReturnChecklist = async (req: AuthRequest, res: Response) => {
  try {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array of { id, completed }' });
    }

    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || transaction.type !== 'REPAIR_IN') {
      return res.status(404).json({ error: 'Repair return transaction not found' });
    }

    const checklist = transaction.repairReturnChecklist || [];
    if (!checklist.length) {
      return res.status(400).json({ error: 'This transaction has no checklist' });
    }

    for (const entry of items) {
      const id = entry?.id;
      const completed = entry?.completed;
      if (!id || typeof completed !== 'boolean') {
        return res.status(400).json({ error: 'Each item must include id and boolean completed' });
      }
      const row = checklist.find((c) => String(c._id) === String(id));
      if (!row) {
        return res.status(400).json({ error: `Unknown checklist id: ${id}` });
      }
      row.completed = completed;
    }

    transaction.markModified('repairReturnChecklist');
    await transaction.save();

    const populated = await Transaction.findById(transaction._id)
      .populate('itemId', ITEM_POPULATE_SELECT)
      .populate('fromLocationId', 'name')
      .populate('toLocationId', 'name')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name');

    res.json({ message: 'Checklist updated', transaction: populated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update checklist' });
  }
};

const typeLabel = (t: string) => {
  switch (t) {
    case 'REPAIR_OUT':
      return 'Sent to Repair';
    case 'REPAIR_IN':
      return 'Returned from Repair';
    case 'TRANSFER':
      return 'Transfer';
    case 'DISPOSE':
      return 'Disposed';
    case 'ADD':
      return 'Stock Add';
    default:
      return t;
  }
};

export const getPrintableTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 500 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(2000, Math.max(1, Number(limit) || 500));

    let filter: Record<string, unknown>;
    try {
      filter = await buildTransactionQuery(req.query as Record<string, unknown>);
    } catch (e: any) {
      return res.status(400).json({ error: e.message || 'Invalid query parameters' });
    }

    const transactions = await Transaction.find(filter)
      .populate('itemId', ITEM_POPULATE_SELECT)
      .populate('fromLocationId', 'name')
      .populate('toLocationId', 'name')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const rows = transactions
      .map((tx: any) => {
        const item = tx.itemId;
        const itemName = item?.name ? escapeHtml(String(item.name)) : '—';
        const created = tx.createdAt ? new Date(tx.createdAt).toISOString() : '—';
        const createdBy = tx.createdBy?.name ? escapeHtml(String(tx.createdBy.name)) : '—';
        const from = tx.fromLocationId?.name ? escapeHtml(String(tx.fromLocationId.name)) : '—';
        const to = tx.toLocationId?.name ? escapeHtml(String(tx.toLocationId.name)) : '—';
        const note = tx.note ? escapeHtml(String(tx.note)) : '';
        return `<tr>
          <td>${created}</td>
          <td>${escapeHtml(typeLabel(tx.type))}</td>
          <td>${itemName}</td>
          <td>${tx.quantity ?? ''}</td>
          <td>${escapeHtml(String(tx.status || ''))}</td>
          <td>${from}</td>
          <td>${to}</td>
          <td>${createdBy}</td>
          <td>${note}</td>
        </tr>`;
      })
      .join('');

    const title = 'Transactions';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @media print {
      .no-print { display: none !important; }
    }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
    button { padding: 8px 12px; font-size: 14px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px;">
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Generated ${escapeHtml(new Date().toISOString())} · Page ${pageNum} · Rows ${transactions.length}</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Item</th>
        <th>Qty</th>
        <th>Status</th>
        <th>From</th>
        <th>To</th>
        <th>Created By</th>
        <th>Note</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="9">No transactions for the current filters.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build printable view' });
  }
};
