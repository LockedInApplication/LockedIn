import prisma from '../model/prisma.js'

export async function createUser(data: {
    email: string,
    phone?: string,
    displayName?: string,
    username?: string,
    name?: string
})
{
    return prisma.user.create({data})
}

export async function getAllUsers(){
    return prisma.user.findMany()
}


export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function updateUser(
  id: string,
  data: {
    email?: string;
    phone?: string;
    displayName?: string;
    username?: string;
    name?: string;
  }
) {
  return prisma.user.update({
    where: { id },
    data,
  });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({
    where: { id },
  });
}