import 'dotenv/config';
import app from './app';
import connectDB from './config/db';

const port = process.env.PORT || 8080;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
