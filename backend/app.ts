import express from "express";
import { createClient, defineScript, RedisModules, RedisScripts, RedisClientType } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

async function connect(): Promise<ReturnType<any>> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({
        url,
        scripts: {
            charge: defineScript({
                NUMBER_OF_KEYS: 1,
                SCRIPT: `
                    local initialBalance = tonumber(redis.call('GET', KEYS[1]))
                    local amount = tonumber(ARGV[1])
                    local accountCharged = false
                    local remainingBalance = initialBalance
                    if initialBalance >= amount then
                        redis.call('INCRBYFLOAT', KEYS[1], -amount)
                        remainingBalance = tonumber(redis.call('GET', KEYS[1]))
                        accountCharged = true
                    end
                    local charges = initialBalance - remainingBalance

                    return {
                        accountCharged,
                        string.format("%.2f", initialBalance),
                        string.format("%.2f", remainingBalance),
                        string.format("%.2f", charges)
                    }
                `,
                // 'return redis.call("GET", KEYS[1]) + ARGV[1];',
                transformArguments(key: string, toCharge: number): Array<string> {
                    return [key, toCharge.toString()];
                },
                transformReply(reply: [number, string, string, string]): { isAuthorized: boolean, initialBalance: number, remainingBalance: number, charges: number} {
                    const [isAuthorized, initialBalance, remainingBalance, charges] = reply;
                    return {
                        isAuthorized: Boolean(isAuthorized),
                        initialBalance: parseFloat(initialBalance),
                        remainingBalance: parseFloat(remainingBalance),
                        charges: parseFloat(charges)
                    };
                }
            })
            }
    });


    await client.connect();
    return client;
}

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
    }
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    if (!account || typeof charges !== 'number' || charges <= 0) {
        throw new Error('Invalid parameters.')
    }
    const client = await connect();
    console.log("Charging account:", account, "Amount:", charges);

    try {
        const response = await client.charge(`${account}/balance`, charges);
        console.log(response);

        return { ...response };
    } finally {
        await client.disconnect();
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully attempted to charge account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
