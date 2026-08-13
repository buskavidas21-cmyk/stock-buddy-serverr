import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Transaction from '../models/Transaction';
import Item from '../models/Item';
import PDFDocument from 'pdfkit';

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

// Strip characters outside Latin-1 range — Helvetica (pdfkit default) can't render them.
const sanitizePdf = (value: unknown): string => {
  if (value == null) return '';
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[^\x00-\xFF]/g, '?');
};

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

  // ── itemId: filter to a specific item ─────────────────────────────────────
  const itemId = query.itemId as string | undefined;
  if (itemId) {
    filter.itemId = itemId;
  }

  // ── managerId: filter to a specific manager ────────────────────────────────
  const managerId = query.managerId as string | undefined;
  if (managerId) {
    filter.managerId = managerId;
  }

  // ── search: full-text match across item fields + note/vendor/serial ────────
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

  // ── locationId: match transactions involving this location ─────────────────
  // Must come AFTER search so we can detect if $or is already set and merge
  // both conditions safely with $and.
  const locationId = query.locationId as string | undefined;
  if (locationId) {
    const locationCond = [
      { fromLocationId: locationId },
      { toLocationId: locationId },
    ];
    if (filter.$or) {
      // search already claimed $or — combine both with $and
      if (!filter.$and) filter.$and = [];
      (filter.$and as unknown[]).push({ $or: filter.$or });
      (filter.$and as unknown[]).push({ $or: locationCond });
      delete filter.$or;
    } else {
      filter.$or = locationCond;
    }
  }

  return filter;
};

// ─── GET /transactions ────────────────────────────────────────────────────────

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
        search: req.query.search,
        locationId: req.query.locationId,
        managerId: req.query.managerId,
        itemId: req.query.itemId,
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

// ─── GET /transactions/:id ────────────────────────────────────────────────────

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

// ─── PATCH /transactions/:id/repair-checklist ─────────────────────────────────

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

// ─── Shared helpers ───────────────────────────────────────────────────────────

const typeLabel = (t: string) => {
  switch (t) {
    case 'REPAIR_OUT':   return 'Sent to Repair';
    case 'REPAIR_IN':    return 'Returned from Repair';
    case 'TRANSFER':     return 'Transfer';
    case 'DISPOSE':      return 'Disposed';
    case 'ADD':          return 'Stock Add';
    default:             return t;
  }
};

// ─── GET /transactions/export/print ──────────────────────────────────────────

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

// ─── GET /transactions/export/pdf ────────────────────────────────────────────

export const exportTransactionsToPdf = async (req: AuthRequest, res: Response) => {
  try {
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
      .limit(5000)
      .lean();

    // ── PDF layout constants ──────────────────────────────────────────────────
    // Landscape A4: 841.89 × 595.28 pt
    const MARGIN = 30;
    const ROW_H  = 18;
    const HDR_H  = 20;
    const PAD    = 4;

    // Column widths (must sum to PAGE_W - 2*MARGIN ≈ 782)
    const COLS    = [92, 68, 130, 35, 58, 105, 105, 97, 92] as const;
    const HEADERS = ['Date', 'Type', 'Item', 'Qty', 'Status', 'From Location', 'To Location', 'Created By', 'Note'];
    const TABLE_W = COLS.reduce((a, b) => a + b, 0); // 782

    // ── Build PDF ─────────────────────────────────────────────────────────────
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ layout: 'landscape', margin: MARGIN, size: 'A4', autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PAGE_H = doc.page.height; // 595.28

      // ── Helper: draw one table header row ────────────────────────────────
      const drawHeader = (startY: number): number => {
        doc.fillColor('#1e3a5f').rect(MARGIN, startY, TABLE_W, HDR_H).fill();
        let cx = MARGIN;
        HEADERS.forEach((h, i) => {
          doc.fillColor('white').font('Helvetica-Bold').fontSize(7.5)
            .text(h, cx + PAD, startY + PAD + 1, {
              width: COLS[i] - PAD * 2,
              lineBreak: false,
            });
          cx += COLS[i];
        });
        return startY + HDR_H;
      };

      // ── Helper: draw one data row ─────────────────────────────────────────
      const drawRow = (tx: any, startY: number, idx: number): number => {
        const bg = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
        doc.fillColor(bg).rect(MARGIN, startY, TABLE_W, ROW_H).fill();
        doc.strokeColor('#dee2e6').lineWidth(0.3)
          .rect(MARGIN, startY, TABLE_W, ROW_H).stroke();

        const dateStr = tx.createdAt
          ? new Date(tx.createdAt).toLocaleString('en-US', {
              year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false,
            })
          : '—';

        const cells = [
          dateStr,
          typeLabel(tx.type ?? ''),
          (tx.itemId as any)?.name ?? '—',
          String(tx.quantity ?? ''),
          tx.status ?? '',
          (tx.fromLocationId as any)?.name ?? '—',
          (tx.toLocationId as any)?.name ?? '—',
          (tx.createdBy as any)?.name ?? '—',
          tx.note ?? '',
        ];

        let cx = MARGIN;
        cells.forEach((cell, i) => {
          doc.fillColor('#222').font('Helvetica').fontSize(7)
            .text(sanitizePdf(cell), cx + PAD, startY + PAD + 1, {
              width: COLS[i] - PAD * 2,
              lineBreak: false,
              ellipsis: true,
            });
          cx += COLS[i];
        });

        return startY + ROW_H;
      };

      // ── Page 1 header section ─────────────────────────────────────────────
      const generatedDate = new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });

      doc.fillColor('#1e3a5f').font('Helvetica-Bold').fontSize(16)
        .text('Inventory Hub — Transaction Report', MARGIN, MARGIN, { lineBreak: false });

      doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
        .text(
          `Generated: ${generatedDate}   ·   Total records: ${transactions.length}`,
          MARGIN, MARGIN + 22, { lineBreak: false }
        );

      // Active-filter summary line
      const filterParts: string[] = [];
      const q = req.query as Record<string, string>;
      if (q.category && q.category !== 'all') filterParts.push(`Category: ${q.category}`);
      if (q.status)     filterParts.push(`Status: ${q.status}`);
      if (q.datePreset) filterParts.push(`Period: ${q.datePreset}`);
      if (q.startDate || q.endDate)
        filterParts.push(`Date: ${q.startDate ?? ''} → ${q.endDate ?? ''}`);
      if (q.search)     filterParts.push(`Search: "${q.search}"`);
      if (q.locationId) filterParts.push(`Location ID: ${q.locationId}`);
      if (q.managerId)  filterParts.push(`Manager ID: ${q.managerId}`);
      if (q.itemId)     filterParts.push(`Item ID: ${q.itemId}`);

      const filterLine = filterParts.length
        ? `Filters applied: ${filterParts.join('  |  ')}`
        : 'Filters: none (showing all transactions)';

      doc.fillColor('#374151').font('Helvetica').fontSize(7.5)
        .text(sanitizePdf(filterLine), MARGIN, MARGIN + 36, { lineBreak: false });

      // ── Table ─────────────────────────────────────────────────────────────
      let y = MARGIN + 54;
      y = drawHeader(y);

      transactions.forEach((tx, idx) => {
        // Page break
        if (y + ROW_H > PAGE_H - MARGIN) {
          doc.addPage();
          y = MARGIN;
          y = drawHeader(y);
        }
        y = drawRow(tx, y, idx);
      });

      if (transactions.length === 0) {
        doc.fillColor('#6b7280').font('Helvetica').fontSize(10)
          .text('No transactions found for the selected filters.', MARGIN, y + 12, { lineBreak: false });
      }

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions_report.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[exportTransactionsToPdf]', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};
