import { performance } from "perf_hooks";
import supertest from "supertest";
import assert from "assert";
import { buildApp } from "./app";

const app = supertest(buildApp());

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start = performance.now();
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    console.log(`Latency: ${performance.now() - start} ms`);
}

async function simultaneousChargesTest() {
    await app.post("/reset").send({ account: "test"}).expect(204);
    const start = performance.now();
    const chargePromises = [30, 30, 30, 30, 30, 30, 30, 30, 30, 30].map((charge) => {
        return app.post("/charge")
            .set('Content-type', 'application/json')
            .send({ account: "test", charges: charge })
            .expect(200);
    });

    await Promise.all(chargePromises);

    const res = await app.post("/charge")
        .set('Content-type', 'application/json')
        .send({ account: "test", charges: 20})
        .expect(200)

    assert.deepStrictEqual(res.body, {
        isAuthorized: false,
        initialBalance: 10,
        remainingBalance: 10,
        charges: 0
    });

    console.log(`Latency: ${performance.now() - start} ms`);
    console.log(res.body);
}

async function runTests() {
    await basicLatencyTest();
    await simultaneousChargesTest();
}

runTests().catch(console.error);
