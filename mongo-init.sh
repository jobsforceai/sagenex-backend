#!/bin/bash

echo "Starting replica set initialization script..."

# Wait up to 30 seconds for MongoDB to become available
for i in {1..15}
do
  if mongosh --host mongodb:27017 --eval "db.adminCommand('ping')" &> /dev/null
  then
    echo "MongoDB is ready."
    # Check if the replica set is already initiated
    if mongosh --host mongodb:27017 --eval "rs.status().ok" | grep -q "1"; then
      echo "Replica set is already initiated."
      exit 0
    fi
    
    echo "Initiating replica set..."
    mongosh --host mongodb:27017 --eval '
      rs.initiate({
        _id: "rs0",
        members: [
          { _id: 0, host: "mongodb:27017" }
        ]
      })
    '
    echo "Replica set initiated successfully."
    exit 0
  fi
  echo "Waiting for MongoDB to start... ($i/15)"
  sleep 2
done

echo "Error: MongoDB did not start within 30 seconds."
exit 1
