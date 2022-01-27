import {APIGatewayEvent, Context} from "aws-lambda";
import * as handler from "../handler";

test("hello", async () => {
  const event = { body: "Test Body" } as APIGatewayEvent;
  const context = {} as Context;

  const callback = (error, response) => {
    expect(response.statusCode).toEqual(200);
    expect(typeof response.body).toBe("string");
  };

  await handler.hello(event, context);

});
