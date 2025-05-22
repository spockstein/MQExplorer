# Setting Up IBM MQ for Testing

This document provides instructions for setting up a local IBM MQ instance for testing the MQ Explorer extension.

## Using Docker

The easiest way to set up a local IBM MQ instance is to use Docker. IBM provides official Docker images for MQ that are easy to set up and use.

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) installed on your machine
- Basic knowledge of Docker commands

### Step 1: Pull the IBM MQ Docker Image

```bash
docker pull icr.io/ibm-messaging/mq:latest
```

### Step 2: Run the IBM MQ Container

```bash
docker run --env LICENSE=accept --env MQ_QMGR_NAME=QM1 --publish 1414:1414 --publish 9443:9443 --detach --name ibmmq icr.io/ibm-messaging/mq:latest
```

This command:
- Accepts the license agreement
- Creates a queue manager named "QM1"
- Exposes port 1414 for MQ connections
- Exposes port 9443 for the web console
- Runs the container in detached mode
- Names the container "ibmmq"

### Step 3: Verify the Container is Running

```bash
docker ps
```

You should see the "ibmmq" container in the list of running containers.

### Step 4: Create a Test Queue

Connect to the container's shell:

```bash
docker exec -it ibmmq /bin/bash
```

Once inside the container, run the following commands to create a test queue:

```bash
# Switch to the mqm user
su - mqm

# Create a test queue
echo "DEFINE QLOCAL('DEV.TEST.QUEUE') REPLACE" | runmqsc QM1
```

### Step 5: Verify the Queue was Created

```bash
echo "DISPLAY QUEUE('DEV.TEST.QUEUE')" | runmqsc QM1
```

You should see information about the newly created queue.

## Connection Parameters

Use the following connection parameters to connect to the local IBM MQ instance:

- **Host**: localhost
- **Port**: 1414
- **Queue Manager**: QM1
- **Channel**: DEV.APP.SVRCONN
- **Username**: app
- **Password**: passw0rd
- **Queue**: DEV.TEST.QUEUE

## Testing with the MQ Explorer Extension

1. Open the MQ Explorer extension in VS Code
2. Create a new connection profile with the above parameters
3. Connect to the queue manager
4. Browse the DEV.TEST.QUEUE
5. Put messages to the queue
6. Delete messages from the queue

## Stopping and Removing the Container

When you're done testing, you can stop and remove the container:

```bash
docker stop ibmmq
docker rm ibmmq
```

## Troubleshooting

### Connection Issues

If you're having trouble connecting to the queue manager, check the following:

1. Make sure the container is running:
   ```bash
   docker ps
   ```

2. Check the container logs for any errors:
   ```bash
   docker logs ibmmq
   ```

3. Verify the queue manager is running:
   ```bash
   docker exec -it ibmmq /bin/bash -c "su - mqm -c 'dspmq'"
   ```

4. Verify the channel is running:
   ```bash
   docker exec -it ibmmq /bin/bash -c "su - mqm -c 'echo \"DISPLAY CHANNEL(DEV.APP.SVRCONN)\" | runmqsc QM1'"
   ```

### Permission Issues

If you're having permission issues, make sure you're using the correct username and password. The default credentials for the Docker container are:

- Username: app
- Password: passw0rd

## Additional Resources

- [IBM MQ Docker Image Documentation](https://github.com/ibm-messaging/mq-container)
- [IBM MQ Knowledge Center](https://www.ibm.com/docs/en/ibm-mq/9.2)
- [IBM MQ Developer Essentials](https://developer.ibm.com/components/ibm-mq/tutorials/mq-develop-mq-jms)
