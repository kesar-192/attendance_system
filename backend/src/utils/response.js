function ok(res, data, { status = 200, meta, message } = {}) {
  const body = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

const created = (res, data, message) => ok(res, data, { status: 201, message });

module.exports = { ok, created };
