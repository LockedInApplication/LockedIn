import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} from '../service/user.service.js';
import { request } from 'node:http';

export async function createUserController(
    request: FastifyRequest<{
        Body: {
            email: string,
            phone?: string,
            displayName: string,
            userName?: string,
            passwordHash: string
    };
}>,
reply: FastifyReply)
{
try {
    const user = await createUser(request.body);
    return reply.status(201).send(user);
}
catch(error){
    request.log.error(error);
    return reply.status(500).send({error: "Failed to create user"});
}
}

export async function getUsersController(
    request: FastifyRequest,
    reply: FastifyReply
){
    try{
        const user = await getAllUsers();
        return reply.send(user);
    } catch(error){
        request.log.error(error);
        return reply.status(500).send({error: "Failed to get users"});
    }
}   

export async function getUserByIdController(
    request: FastifyRequest<{
        Params: { id: string }
    }>,
    reply: FastifyReply)
    {
        try {
            const user = await getUserById(request.params.id);
            if (!user){
                return reply.status(404).send({error: "User not found"});
            }
            return reply.send(user);
        } catch(error){
            request.log.error(error);
            return reply.status(500).send({error: "Failed to get user"});
        }
    }

export async function updateUserController(
  request: FastifyRequest<{
    Params: { id: string };
    Body: {
      email?: string;
      phone?: string;
      displayName?: string;
      username?: string;
      passwordHash?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const user = await updateUser(request.params.id, request.body);
    return reply.send(user);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Failed to update user' });
  }
}

export async function deleteUserController(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    await deleteUser(request.params.id);
    return reply.status(204).send();
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Failed to delete user' });
  }
}