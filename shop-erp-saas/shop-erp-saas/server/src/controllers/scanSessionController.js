import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { branchFilter } from '../middleware/tenant.js';
import { config } from '../config/env.js';
import ScanSession from '../models/ScanSession.js';

// Idle timeout, renewed on every poll/scan while the connection is actually in
// use (see getScanSession/submitScan) — so in practice this is "no timeout" for
// as long as the app tab stays open and connected, just like a paired hardware
// scanner. It only lapses if nothing touches it for a full hour (e.g. the
// browser was closed without explicitly disconnecting).
const IDLE_TIMEOUT_MINUTES = 60;
const MAX_SCANS = 500;       // abuse guard — the array is drained on every POS
                              // poll (see `consume`), so this is never approached
                              // in normal use regardless of session lifetime
const MAX_VALUE_LEN = 100;   // no real barcode/IMEI is anywhere near this long

const renew = () => new Date(Date.now() + IDLE_TIMEOUT_MINUTES * 60 * 1000);

// A session is usable only while both the token matches and it hasn't expired —
// checked identically wherever the token is presented.
const validSession = (session, token) =>
  session && session.token === token && session.expiresAt > new Date();

// @route POST /api/scan-sessions  (POS/Products, authenticated)
// Creates a "remote scan" connection and returns the URL the app turns into a QR
// code. Whoever scans that QR (no login needed) can submit barcode values to
// this connection only — nothing else is reachable with the token. Stays alive
// indefinitely as long as it's being used (see IDLE_TIMEOUT_MINUTES); ends only
// on an explicit disconnect or an hour of total inactivity.
export const createScanSession = asyncHandler(async (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  const session = await ScanSession.create({
    business: req.businessId, branch: req.branchId, createdBy: req.user._id, token, expiresAt: renew(),
  });
  const url = `${config.clientUrl}/scan/${session._id}?t=${token}`;
  created(res, { sessionId: session._id, token, expiresAt: session.expiresAt, url });
});

// @route GET /api/scan-sessions/:id?t=TOKEN[&consume=true]  (public, no login)
// Used by the phone page to confirm the connection is still valid (no side
// effects), and by the connected app tab to poll for newly-submitted scans
// (`consume=true` — hands over whatever is pending and clears it server-side,
// so the array never grows no matter how long the connection stays open).
export const getScanSession = asyncHandler(async (req, res) => {
  const session = await ScanSession.findById(req.params.id).populate('business', 'name');
  if (!validSession(session, req.query.t)) throw new ApiError(404, 'This scan connection has ended or is invalid');

  session.expiresAt = renew();
  const scans = session.scans;
  if (req.query.consume === 'true') session.scans = [];
  await session.save();
  ok(res, { expiresAt: session.expiresAt, scans, business: session.business?.name || '' });
});

// @route POST /api/scan-sessions/:id/scans  (public, no login)
// The phone page calls this once per detected barcode/QR/IMEI. Only the raw
// value is recorded here — looking it up as a product/unit happens back on the
// authenticated app side, so this public endpoint never touches real business data.
export const submitScan = asyncHandler(async (req, res) => {
  const { value, format = '', t } = req.body;
  const session = await ScanSession.findById(req.params.id);
  if (!validSession(session, t)) throw new ApiError(404, 'This scan connection has ended or is invalid');

  const clean = String(value || '').trim().slice(0, MAX_VALUE_LEN);
  if (!clean) throw new ApiError(400, 'No barcode value');
  if (session.scans.length >= MAX_SCANS) throw new ApiError(400, 'Too many scans waiting to be picked up — make sure the app tab is still open and connected');

  session.expiresAt = renew();
  session.scans.push({ value: clean, format: String(format || '').slice(0, 30) });
  await session.save();
  created(res, { count: session.scans.length });
});

// @route DELETE /api/scan-sessions/:id  (authenticated) — explicit disconnect
export const closeScanSession = asyncHandler(async (req, res) => {
  await ScanSession.updateOne(branchFilter(req, { _id: req.params.id }), { expiresAt: new Date() });
  ok(res, {}, 'Scanner disconnected');
});
