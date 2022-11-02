import "./App.css";
import React from "react";
import { v4 } from "uuid";
import { build, fake } from "@jackfranklin/test-data-bot";
import { Button, Group, Text, TextInput } from "@mantine/core";
import { createMachine, forwardTo, send } from "xstate";
import { createModel } from "xstate/lib/model";
import { useMachine } from "@xstate/react";
import { z } from "zod";
import produce from "immer";

const Parsers = {
  Authorize: z.object({
    idTagInfo: z.object({
      status: z.enum(["Accepted", "Blocked", "Expired", "Invalid"] as const),
    }),
  }),
} as const;

type ResponseType = keyof typeof Parsers;

interface IBootNotificationReq {
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber: string;
  chargeBoxSerialNumber: string;
  firmwareVersion: string;
  iccid: string;
  imsi: string;
  meterType: string;
  meterSerialNumber: string;
}

const bootNotificationReqBuilder = build<IBootNotificationReq>({
  fields: {
    chargeBoxSerialNumber: fake((f) => f.datatype.uuid()),
    chargePointModel: fake((f) => f.datatype.uuid()),
    chargePointSerialNumber: fake((f) => f.datatype.uuid()),
    chargePointVendor: fake((f) => f.datatype.uuid()),
    firmwareVersion: fake((f) => f.datatype.number().toString()),
    iccid: fake((f) => f.datatype.uuid()),
    imsi: fake((f) => f.datatype.uuid()),
    meterSerialNumber: fake((f) => f.datatype.number().toString()),
    meterType: fake((f) => f.datatype.number().toString()),
  },
});

const model = createModel(
  {
    webSocket: undefined as unknown as WebSocket,
    messages: {} as Record<string, ResponseType>,
  },
  {
    events: {
      swipe_card: (idTag: string, messageId: string) => ({
        idTag,
        messageId,
      }),
      authorization_fail: () => ({}),
      authorization_success: () => ({}),
    },
  }
);

const messageTypeCache = new Map<string, ResponseType>();

const machine = model.createMachine(
  {
    id: "Machine Name",
    initial: "unauthorized",
    states: {
      unauthorized: {
        on: {
          swipe_card: {
            target: "authorizing",
            actions: ["authorize"],
          },
        },
      },
      authorizing: {
        on: {
          authorization_fail: {
            target: "unauthorized",
          },
          authorization_success: {
            target: "authorized",
          },
        },
      },
      authorized: {},
    },
    predictableActionArguments: true,
    preserveActionOrder: true,

    invoke: {
      id: "webSocket",
      src: (context) => (callback) => {
        context.webSocket.onmessage = (event) => {
          const parsedData = JSON.parse(event.data);
          const [, id] = parsedData;

          const messageType = messageTypeCache.get(id);
          if (!messageType) {
            return;
          }
          messageTypeCache.delete(id);

          switch (messageType) {
            case "Authorize": {
              const data = Parsers.Authorize.parse(parsedData[2]);
              if (data.idTagInfo.status === "Accepted") {
                callback({ type: "authorization_success" });
              } else {
                callback({ type: "authorization_fail" });
              }
              break;
            }
          }
        };
      },
    },
  },
  {
    actions: {
      authorize: model.assign((context, event) => {
        if (event.type !== "swipe_card") {
          return context;
        }
        const messageType = "Authorize";
        messageTypeCache.set(event.messageId, messageType);
        context.webSocket.send(
          JSON.stringify([
            2,
            event.messageId,
            messageType,
            { idTag: event.idTag },
          ])
        );
        return context;
      }),
    },
  }
);

function App() {
  const [webSocket, setWebSocket] = React.useState<WebSocket>();

  React.useEffect(() => {
    setWebSocket(
      new WebSocket(
        "ws://localhost:8180/steve/websocket/CentralSystemService/john",
        "ocpp1.6"
      )
    );
  }, []);

  return (
    <div className="App">{webSocket && <Machine webSocket={webSocket} />}</div>
  );
}

function Machine({ webSocket }: { webSocket: WebSocket }) {
  const [state, send] = useMachine(machine, { context: { webSocket } });
  const [idTag, setIdTag] = React.useState("");

  return (
    <div>
      <Text>{state.value.toString()}</Text>

      <Group
        sx={{
          alignItems: "flex-end",
          marginTop: 24,
        }}
      >
        <TextInput
          label="Id tag"
          value={idTag}
          onChange={(e) => setIdTag(e.target.value)}
        />

        <Button
          onClick={() => send({ type: "swipe_card", idTag, messageId: v4() })}
          sx={{ marginTop: 10 }}
        >
          Swipe card
        </Button>
      </Group>
    </div>
  );
}

export default App;
