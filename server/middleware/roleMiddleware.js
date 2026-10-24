const roleMiddleware = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User data not found" });
    }

    // A school admin manages their whole school, so admin may use every role-restricted
    // route. This is safe only because each handler is limited to the caller's own school.
    if (req.user.role === "admin") {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};

module.exports = roleMiddleware;
