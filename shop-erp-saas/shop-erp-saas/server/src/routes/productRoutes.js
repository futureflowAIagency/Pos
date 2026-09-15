import { Router } from 'express';
import { getProducts, getProductByBarcode, createProduct, createProductsWithSupplier, updateProduct, adjustProductStock, deleteProduct, getStockSnapshot, getStockByDate, getProductCategories, getProductReport, getProductPurchaseBatches } from '../controllers/productController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('products'));
router.route('/').get(getProducts).post(createProduct);
router.post('/batch-with-supplier', createProductsWithSupplier);
router.get('/barcode/:code', getProductByBarcode);
router.get('/categories', getProductCategories);
router.get('/stock-snapshot', getStockSnapshot);
router.get('/stock-by-date', getStockByDate);
router.patch('/:id/stock', adjustProductStock);
router.get('/:id/report', getProductReport);
router.get('/:id/purchase-batches', getProductPurchaseBatches);
router.route('/:id').put(updateProduct).delete(deleteProduct);
export default router;
