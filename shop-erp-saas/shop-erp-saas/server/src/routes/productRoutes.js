import { Router } from 'express';
import { getProducts, getProductByBarcode, createProduct, createProductsWithSupplier, updateProduct, adjustProductStock, deleteProduct, getStockSnapshot } from '../controllers/productController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('products'));
router.route('/').get(getProducts).post(createProduct);
router.post('/batch-with-supplier', createProductsWithSupplier);
router.get('/barcode/:code', getProductByBarcode);
router.get('/stock-snapshot', getStockSnapshot);
router.patch('/:id/stock', adjustProductStock);
router.route('/:id').put(updateProduct).delete(deleteProduct);
export default router;
