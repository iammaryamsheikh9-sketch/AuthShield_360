export const rootCheck = (_req: unknown, res: any) => res.status(200).json({
  success: true,
  message: "AuthShield 360 API is running"
});

export const healthCheck = (_req: unknown, res: any) => res.status(200).json({
  success: true,
  message: "AuthShield 360 server is healthy",
  timestamp: new Date().toISOString()
});

export const adminProfile = (req: any, res: any) => res.status(200).json({
  success: true,
  message: "You are authenticated",
  user: {
    id: req.user._id,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role?.name,
    status: req.user.status
  },
  session: {
    id: req.session._id,
    expiresAt: req.session.expiresAt
  }
});
