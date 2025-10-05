import { Router } from 'express';
import adminRoutes from '../admin/admin.routes';

const mainRouter = Router();

mainRouter.use('/admin', adminRoutes);

export default mainRouter;
