import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // Use Docker-internal hostname if running in container, otherwise use localhost for local dev
    const mongoHost = process.env.IS_DOCKER === 'true' ? 'mongodb' : 'localhost';
    const mongoPort = process.env.IS_DOCKER === 'true' ? '27017' : '27018';
    
    const mongoURI = `mongodb://${mongoHost}:${mongoPort}/segnex-backend`;
    
    if (!mongoURI) {
      throw new Error('MONGO_URI could not be constructed');
    }
    await mongoose.connect(mongoURI);
    console.log(`MongoDB connected successfully at ${mongoHost}`);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
