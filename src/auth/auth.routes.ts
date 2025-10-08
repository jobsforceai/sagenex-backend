import { Router } from "express";
import passport from "passport";
import * as authController from "./auth.controller";
import { generateToken } from "./auth.service";

const router = Router();

router.post("/login", authController.loginController);

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    session: false,
  }),
  (req, res) => {
    // Successful authentication, redirect or send token
    const token = generateToken(req.user);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

export default router;
