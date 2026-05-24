import { Router } from 'express';
import { authenticate, requireProjectAccess } from '../auth.js';
import { computeProject } from '../finance.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/', requireProjectAccess('viewer', 'dashboard'), (req, res) => {
  const data = computeProject(req.project.id);
  if (!data) return res.status(404).json({ error: 'Project not found' });
  res.json(data);
});

export default router;
