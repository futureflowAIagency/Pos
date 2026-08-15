import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { branchFilter } from '../middleware/tenant.js';
import { config } from '../config/env.js';
import ScanSession from '../models/ScanSession.js';

const SESSION_MINUTES = 10;
const MAX_SCANS = 300;       // abuse guard — plenty for one counter's worth of scanning
const MAX_VALUE_LEN = 100;   // no real barcode/IMEI is anywhere near this long

// A session is usable only while both the token matches and it hasn't expired —
// checked identically wherever the token is presented.
const validSession = (session, token) =>
  session && session.token === token && session.expiresAt > new Date();

// @route POST /api/scan-sessions  (POS, authenticated)
// Creates a short-lived "remote scan" session and returns the URL the POS turns
// into a QR code. Whoever scans that QR (no login needed) can submit barcode
// values to this session only, for a few minutes — nothing else is reachable
// with the token.
export const createScanSession = asyncHandler(async (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60 * 1000);
  const session = await ScanSession.create({
    business: req.businessId, branch: req.branchId, createdBy: req.user._id, token, expiresAt,
  });
  const url = `${config.clientUrl}/scan/${session._id}?t=${token}`;
  created(res, { sessionId: session._id, token, expiresAt, url });
});

// @route GET /api/scan-sessions/:id?t=TOKEN  (public, no login)
// Used by the phone page to confirm the QR is still valid, and by the POS tab to
// poll for newly-submitted scans.
export const getScanSession = asyncHandler(async (req, res) => {
  const session = await ScanSession.findById(req.params.id).populate('business', 'name');
  if (!validSession(session, req.query.t)) throw new ApiError(404, 'This scan session has expired or is invalid');
  ok(res, { expiresAt: session.expiresAt, scans: session.scans, business: session.business?.name || '' });
});

// @route POST /api/scan-sessions/:id/scans  (public, no login)
// The phone page calls this once per detected barcode/QR/IMEI. Only the raw
// value is recorded here — looking it up as a product/unit happens back on the
// POS side (which already has full, authenticated business context), so this
// public endpoint never touches real business data.
export const submitScan = asyncHandler(async (req, res) => {
  const { value, format = '', t } = req.body;
  const session = await ScanSession.findById(req.params.id);
  if (!validSession(session, t)) throw new ApiError(404, 'This scan session has expired or is invalid');

  const clean = String(value || '').trim().slice(0, MAX_VALUE_LEN);
  if (!clean) throw new ApiError(400, 'No barcode value');
  if (session.scans.length >= MAX_SCANS) throw new ApiError(400, 'This session has reached its scan limit — open a new QR code on the POS');

  session.scans.push({ value: clean, format: String(format || '').slice(0, 30) });
  await session.save();
  created(res, { count: session.scans.length });
});

// @route DELETE /api/scan-sessions/:id  (POS, authenticated)
// Ends the session early when the QR modal is closed, so the phone page notices
// right away instead of waiting out the full 10 minutes.
export const closeScanSession = asyncHandler(async (req, res) => {
  await ScanSession.updateOne(branchFilter(req, { _id: req.params.id }), { expiresAt: new Date() });
  ok(res, {}, 'Session closed');
});
