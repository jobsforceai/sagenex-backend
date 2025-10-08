import express, { Application, Request, Response } from "express";
import cors from "cors";
import session from "express-session";
import passport from "./config/passport";
import mainRouter from "./routes";

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: true,
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// API Routes
app.use("/api/v1", mainRouter);

// Health check endpoint
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ message: "Server is healthy" });
});

export default app;
