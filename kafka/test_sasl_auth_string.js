/*

This is a k6 test script that imports the xk6-kafka and
tests Kafka with a 200 JSON messages per iteration. It
also uses SASL authentication.

*/

import { check } from "k6";
import {
  Writer,
  Reader,
  Connection,
  SchemaRegistry,
  SCHEMA_TYPE_STRING,
  SASL_PLAIN,
  TLS_1_2,
} from "k6/x/kafka"; // import kafka extension

export const options = {
  // This is used for testing purposes. For real-world use, you should use your own options:
  // https://k6.io/docs/using-k6/k6-options/
  scenarios: {
    sasl_auth: {
      executor: "constant-vus",
      vus: 1,
      duration: "10s",
      gracefulStop: "1s",
    },
  },
};

//const brokers = ["localhost:9092"];
//const brokers = ["pkc-p11xm.us-east-1.aws.confluent.cloud:9092"];
//const brokers = ["pkc-p11xm.us-east-1.aws.confluent.cloud:9092"];
//const brokers = [__ENV.BROKERS];
const brokers = __ENV.BROKERS.split(","); 
const topic = "xk6_kafka_string_topic";
const autoCreateTopic = __ENV.AUTOCREATE || "false";

// SASL config is optional
const saslConfig = {
  username: __ENV.USER_SASL || 'JZOATLWF3NK4UE34',
  password: __ENV.PASS_SASL || 'GktzeatMmLn1bjCkls2ZEKeLHY4uMAUhFR4mPC8VxbyWiMIwbVcVVGs4ZOPSuppM',
  // Possible values for the algorithm is:
  // NONE (default)
  // SASL_PLAIN
  // SASL_SCRAM_SHA256
  // SASL_SCRAM_SHA512
  // SASL_SSL (must enable TLS)
  // SASL_AWS_IAM (configurable via env or AWS IAM config files - no username/password needed)
  algorithm: __ENV.ALGORITHM || SASL_PLAIN,
};

// TLS config is optional
const tlsConfig = {
  // Enable/disable TLS (default: false)
  enableTls: true,
  // Skip TLS verification if the certificate is invalid or self-signed (default: false)
  insecureSkipTlsVerify: false,
  // Possible values:
  // TLS_1_0
  // TLS_1_1
  // TLS_1_2 (default)
  // TLS_1_3
  minVersion: TLS_1_2,

  // Only needed if you have a custom or self-signed certificate and keys
  // clientCertPem: "/path/to/your/client.pem",
  // clientKeyPem: "/path/to/your/client-key.pem",
  // serverCaPem: "/path/to/your/ca.pem",
};

const offset = 0;
// partition and groupId are mutually exclusive
const partition = 0;
const numPartitions = 1;
const replicationFactor = 1;

const writer = new Writer({
  brokers: brokers,
  topic: topic,
  sasl: saslConfig,
  tls: tlsConfig,
});
const reader = new Reader({
  brokers: brokers,
  topic: topic,
  partition: partition,
  offset: offset,
  sasl: saslConfig,
  tls: tlsConfig,
});
const connection = new Connection({
  address: brokers[0],
  sasl: saslConfig,
  tls: tlsConfig,
});
const schemaRegistry = new SchemaRegistry();

if (__VU == 0 && autoCreateTopic == "true") {
    connection.createTopic({
        topic: topic,
        numPartitions: numPartitions,
        replicationFactor: replicationFactor,
    });
    console.log(
        "Existing topics: ",
        connection.listTopics(saslConfig, tlsConfig),
    );
}

export default function () {
    for (let index = 0; index < 100; index++) {
        let messages = [
            {
                key: schemaRegistry.serialize({
                    data: "test-key-string",
                    schemaType: SCHEMA_TYPE_STRING,
                }),
                value: schemaRegistry.serialize({
                    data: "test-value-string",
                    schemaType: SCHEMA_TYPE_STRING,
                }),
                headers: {
                    mykey: "myvalue",
                },
                offset: index,
                partition: 0,
                time: new Date(), // Will be converted to timestamp automatically
            },
            {
                key: schemaRegistry.serialize({
                    data: "test-key-string",
                    schemaType: SCHEMA_TYPE_STRING,
                }),
                value: schemaRegistry.serialize({
                    data: "test-value-string",
                    schemaType: SCHEMA_TYPE_STRING,
                }),
                headers: {
                    mykey: "myvalue",
                },
            },
        ];

        writer.produce({ messages: messages });
    }

    // Read 10 messages only
    let messages = reader.consume({ limit: 10 });

    check(messages, {
        "10 messages are received": (messages) => messages.length == 10,
    });

    check(messages[0], {
        "Topic equals to xk6_kafka_json_topic": (msg) => msg["topic"] == topic,
        "Key is a string and is correct": (msg) =>
            schemaRegistry.deserialize({
                data: msg.key,
                schemaType: SCHEMA_TYPE_STRING,
            }) == "test-key-string",
        "Value is a string and is correct": (msg) =>
            typeof schemaRegistry.deserialize({
                data: msg.value,
                schemaType: SCHEMA_TYPE_STRING,
            }) == "string" &&
            schemaRegistry.deserialize({
                data: msg.value,
                schemaType: SCHEMA_TYPE_STRING,
            }) == "test-value-string",
        "Header equals {'mykey': 'myvalue'}": (msg) =>
            "mykey" in msg.headers &&
            String.fromCharCode(...msg.headers["mykey"]) == "myvalue",
        "Time is past": (msg) => new Date(msg["time"]) < new Date(),
        "Partition is zero": (msg) => msg["partition"] == 0,
        "Offset is gte zero": (msg) => msg["offset"] >= 0,
        "High watermark is gte zero": (msg) => msg["highWaterMark"] >= 0,
    });
}

export function teardown(data) {
  if (__VU == 0 && autoCreateTopic == "true") {
    // Delete the topic
    connection.deleteTopic(topic);
  }
  writer.close();
  reader.close();
  connection.close();
}
