import type { FastifyInstance } from 'fastify';
import {
  createUserController,
  getUsersController,
  getUserByIdController,
  updateUserController,
  deleteUserController,
} from '../controller/user.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export async function userRoutes(server: FastifyInstance) {
  server.post('/users', createUserController);

  server.get('/users', { preHandler: requireAuth }, getUsersController);

  server.get<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireAuth },
    getUserByIdController
  );

  server.patch<{
    Params: { id: string };
    Body: {
      email?: string;
      phone?: string;
      displayName?: string;
      username?: string;
      name?: string;
    };
  }>(
    '/users/:id',
    { preHandler: requireAuth },
    updateUserController
  );

  server.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireAuth },
    deleteUserController
  );
}