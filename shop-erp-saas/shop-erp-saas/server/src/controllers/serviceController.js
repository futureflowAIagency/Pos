import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import ServiceJob, { SERVICE_STATUSES } from '../models/ServiceJob.js';

const genJobNo = () => 'JOB-' + Date.now().toString().slice(-8) + '-' + Math.floor(Math.random() * 90 + 10);

// @route GET /api/services?status=&search=
export const getServiceJobs = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const q = branchFilter(req);
  if (status) q.status = status;
  if (search) q.$or = [
    { jobNo: { $regex: search, $options: 'i' } },
    { customerName: { $regex: search, $options: 'i' } },
    { customerPhone: { $regex: search, $options: 'i' } },
    { deviceModel: { $regex: search, $options: 'i' } },
  ];
  const jobs = await ServiceJob.find(q).sort('-createdAt');
  ok(res, { jobs, count: jobs.length });
});

// @route GET /api/services/:id
export const getServiceJob = asyncHandler(async (req, res) => {
  const job = await ServiceJob.findOne(branchFilter(req, { _id: req.params.id }));
  if (!job) throw new ApiError(404, 'Service job not found');
  ok(res, { job });
});

// Customer bill = serviceFee ONLY. partsCost/technicianCost never add to what the
// customer is charged — they only reduce the shop's internal profit.
const computeTotal = (body, current = {}) => {
  const fee = Number(body.serviceFee ?? current.serviceFee ?? 0);
  return Math.round(fee * 100) / 100;
};
const computeProfit = (body, current = {}) => {
  const fee = Number(body.serviceFee ?? current.serviceFee ?? 0);
  const parts = Number(body.partsCost ?? current.partsCost ?? 0);
  const tech = Number(body.technicianCost ?? current.technicianCost ?? 0);
  return Math.round((fee - parts - tech) * 100) / 100;
};

// @route POST /api/services
export const createServiceJob = asyncHandler(async (req, res) => {
  const { customerName, deviceModel } = req.body;
  if (!customerName?.trim()) throw new ApiError(400, 'Customer name is required');
  if (!deviceModel?.trim()) throw new ApiError(400, 'Device model is required');

  const total = computeTotal(req.body);
  const profit = computeProfit(req.body);
  const job = await ServiceJob.create({
    ...req.body,
    business: req.businessId,
    branch: req.branchId,
    jobNo: genJobNo(),
    total,
    profit,
    status: 'pending',
    statusHistory: [{ status: 'pending', at: new Date() }],
    createdBy: req.user._id,
  });
  await logActivity(req, { action: 'CREATE_SERVICE_JOB', entity: 'ServiceJob', entityId: job._id, meta: { jobNo: job.jobNo } });
  created(res, { job });
});

// @route PUT /api/services/:id
export const updateServiceJob = asyncHandler(async (req, res) => {
  const job = await ServiceJob.findOne(branchFilter(req, { _id: req.params.id }));
  if (!job) throw new ApiError(404, 'Service job not found');

  const fields = ['customerName', 'customerPhone', 'customer', 'deviceModel', 'imei', 'problem', 'budget', 'technician', 'serviceFee', 'partsCost', 'technicianCost', 'paid', 'paymentMethod'];
  fields.forEach((f) => { if (req.body[f] !== undefined) job[f] = req.body[f]; });
  job.total = computeTotal(req.body, job);
  job.profit = computeProfit(req.body, job);
  await job.save();
  await logActivity(req, { action: 'UPDATE_SERVICE_JOB', entity: 'ServiceJob', entityId: job._id });
  ok(res, { job }, 'Service job updated');
});

// @route PATCH /api/services/:id/status  body: { status }
export const setServiceStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!SERVICE_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
  const job = await ServiceJob.findOne(branchFilter(req, { _id: req.params.id }));
  if (!job) throw new ApiError(404, 'Service job not found');
  job.status = status;
  job.statusHistory.push({ status, at: new Date() });
  await job.save();
  await logActivity(req, { action: 'SERVICE_STATUS', entity: 'ServiceJob', entityId: job._id, meta: { status } });
  ok(res, { job }, `Status updated to ${status}`);
});

// @route DELETE /api/services/:id
export const deleteServiceJob = asyncHandler(async (req, res) => {
  const job = await ServiceJob.findOneAndDelete(branchFilter(req, { _id: req.params.id }));
  if (!job) throw new ApiError(404, 'Service job not found');
  await logActivity(req, { action: 'DELETE_SERVICE_JOB', entity: 'ServiceJob', entityId: job._id });
  ok(res, {}, 'Service job deleted');
});
