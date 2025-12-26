const createRateLimiter = ({ windowMs, max, message, redirectTo }) => {
  const attemptsByIp = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = attemptsByIp.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }

    entry.count += 1;
    attemptsByIp.set(key, entry);

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set("Retry-After", String(Math.max(retryAfter, 0)));
      if (req.session) {
        req.session.flash = { type: "danger", message };
      }
      return res.status(429).redirect(redirectTo);
    }

    return next();
  };
};

module.exports = createRateLimiter;