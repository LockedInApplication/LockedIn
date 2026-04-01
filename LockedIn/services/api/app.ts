import Fastify from 'fastify';  

const server = Fastify({ logger: true });

async function main(){

    server.get("/healthcheck", async (request, reply) => {
        return {status: "ok"}
})

    try {
        await server.listen({port: 3000, host: "0.0.0.0"})
        console.log(`Server listening athttp://localhost:3000/}`);
    }
    catch(err){
        console.error("Error starting server:", err);
        process.exit(1)
    }
}

main()