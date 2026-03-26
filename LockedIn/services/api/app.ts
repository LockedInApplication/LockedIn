import Fastify from 'fastify';  

const server = Fastify({ logger: true });

async function main(){

    server.get("/healthcheck", async (request, reply) => {
        return {status: "ok"}
})

    try {
        server.listen({port: 3000, host: "0.0.0.0"}, (err, address) => {
            console.log(`Server listening at ${address}`);
        });
    }
    catch(err){
        console.error("Error starting server:", err);
        process.exit(1)
    }
}

main()