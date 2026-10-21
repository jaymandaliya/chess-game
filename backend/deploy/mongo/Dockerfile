# Official MongoDB image run as a single-node replica set (the API needs transactions).
FROM mongo:8.0
COPY start.sh /usr/local/bin/start-replset.sh
RUN chmod +x /usr/local/bin/start-replset.sh
EXPOSE 27017
CMD ["start-replset.sh"]
