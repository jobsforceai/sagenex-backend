import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import mainRouter from './routes';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/v1', mainRouter);

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Server is healthy' });
});

export default app;
