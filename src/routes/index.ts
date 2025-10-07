import { Router } from 'express';
import adminRoutes from '../admin/admin.routes';
import collectorRoutes from '../collector/collector.routes';
import walletRoutes from '../wallet/wallet.routes';
import ratesRoutes from '../rates/rates.routes';
import authRoutes from '../auth/auth.routes';
import userRoutes from '../user/user.routes';

const mainRouter = Router();

mainRouter.use('/auth', authRoutes);
mainRouter.use('/admin', adminRoutes);
mainRouter.use('/collector', collectorRoutes);
mainRouter.use('/user', userRoutes);
mainRouter.use('/wallet', walletRoutes);
mainRouter.use('/rates', ratesRoutes);

export default mainRouter;
