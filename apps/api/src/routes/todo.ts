import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateTaskRequestSchema,
  UpdateTaskRequestSchema,
  AddCommentRequestSchema,
  RejectTaskRequestSchema,
  EscalateTaskRequestSchema,
  TodoQuerySchema,
  TodoReportQuerySchema,
  type TodoQuery,
} from '@lolas/shared';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const manage = requirePermission(Permission.ManageTodo);
const view = requirePermission(Permission.ViewTodo);

// ── Static paths first (before /:id) ──

router.get('/unseen-count', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await req.app.locals.deps.todoRepo.getUnreadCount(req.user!.employeeId);
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
});

router.get('/notifications', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifs = await req.app.locals.deps.todoRepo.getNotifications(req.user!.employeeId);
    res.json({ success: true, data: notifs });
  } catch (err) { next(err); }
});

router.post('/notifications/dismiss', view, validateBody(
  z.object({ id: z.string().uuid() }),
), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await req.app.locals.deps.todoRepo.dismissNotification(req.body.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/notifications/read-all', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await req.app.locals.deps.todoRepo.markAllRead(req.user!.employeeId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/report', manage, validateQuery(TodoReportQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as { storeId?: string; from: string; to: string };
    const storeIds = q.storeId ? [q.storeId] : req.user!.storeIds;
    const data = await req.app.locals.deps.todoRepo.getReport(storeIds, q.from, q.to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Collection routes ──

router.get('/', view, validateQuery(TodoQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as TodoQuery;
    const filters = {
      status: q.status,
      priority: q.priority,
      assignedTo: q.assignedTo,
      categoryId: q.categoryId,
      isEscalated: q.isEscalated,
    };
    const tasks = q.storeId
      ? await req.app.locals.deps.todoRepo.findForStore(q.storeId, filters)
      : await req.app.locals.deps.todoRepo.findForStores(req.user!.storeIds, filters);
    res.json({ success: true, data: tasks });
  } catch (err) { next(err); }
});

router.post('/', view, validateBody(CreateTaskRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { createTask } = await import('../use-cases/todo/create-task.js');
    const result = await createTask(
      { ...req.body, createdBy: req.user!.employeeId },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Single task ──

router.get('/:id', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await req.app.locals.deps.todoRepo.findById(req.params.id as string);
    if (!task) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
      return;
    }
    res.json({ success: true, data: task });
  } catch (err) { next(err); }
});

router.put('/:id', view, validateBody(UpdateTaskRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { updateTask } = await import('../use-cases/todo/update-task.js');
    const result = await updateTask(
      { ...req.body, taskId: req.params.id as string, actorId: req.user!.employeeId },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Lifecycle transitions ──

router.post('/:id/acknowledge', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { claimTask } = await import('../use-cases/todo/claim-task.js');
    const result = await claimTask(
      { taskId: req.params.id as string, employeeId: req.user!.employeeId, storeId: req.user!.storeIds[0] ?? '' },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/start', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startTask } = await import('../use-cases/todo/start-task.js');
    const result = await startTask(
      { taskId: req.params.id as string, employeeId: req.user!.employeeId },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/submit', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { submitTask } = await import('../use-cases/todo/submit-task.js');
    const result = await submitTask(
      { taskId: req.params.id as string, employeeId: req.user!.employeeId },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/verify', manage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { verifyTask } = await import('../use-cases/todo/verify-task.js');
    const result = await verifyTask(
      { taskId: req.params.id as string, managerId: req.user!.employeeId },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/reject', manage, validateBody(RejectTaskRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rejectTask } = await import('../use-cases/todo/reject-task.js');
    const result = await rejectTask(
      { taskId: req.params.id as string, managerId: req.user!.employeeId, reason: req.body.reason },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/escalate', manage, validateBody(EscalateTaskRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { escalateTask } = await import('../use-cases/todo/escalate-task.js');
    const result = await escalateTask(
      { taskId: req.params.id as string, managerId: req.user!.employeeId, reason: req.body.reason },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Comments & events ──

router.post('/:id/comment', view, validateBody(AddCommentRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { addComment } = await import('../use-cases/todo/add-comment.js');
    const result = await addComment(
      { taskId: req.params.id as string, employeeId: req.user!.employeeId, content: req.body.content },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/:id/comments', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comments = await req.app.locals.deps.todoRepo.getComments(req.params.id as string);
    res.json({ success: true, data: comments });
  } catch (err) { next(err); }
});

router.get('/:id/events', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await req.app.locals.deps.todoRepo.getEvents(req.params.id as string);
    res.json({ success: true, data: events });
  } catch (err) { next(err); }
});

router.post('/:id/seen', view, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { markSeen } = await import('../use-cases/todo/mark-seen.js');
    const result = await markSeen(
      { taskId: req.params.id as string, userId: req.user!.employeeId },
      { todo: req.app.locals.deps.todoRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as todoRoutes };
