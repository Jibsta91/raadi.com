# syntax=docker/dockerfile:1.12
# imgproxy (OSS, Apache-2.0): resizes listing images on the fly from SeaweedFS.
# The wrapper reads the URL-signing key/salt and S3 secret from the secrets mount.
FROM darthsim/imgproxy:v4.0.17
COPY --chmod=0755 entrypoint.sh /opt/raadi/entrypoint.sh
USER 999
ENTRYPOINT ["/opt/raadi/entrypoint.sh"]
CMD ["imgproxy"]
