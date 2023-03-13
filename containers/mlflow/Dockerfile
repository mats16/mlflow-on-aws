FROM public.ecr.aws/docker/library/python:3.10-bullseye

ARG MLFLOW_VERSION=2.1.1

RUN pip install --no-cache \
    mlflow==$MLFLOW_VERSION \
    mlflow[extras]==$MLFLOW_VERSION \
    pymysql \
    boto3

WORKDIR /mlflow

EXPOSE 5000

CMD mlflow server \
    --host 0.0.0.0 \
    --port 5000 \
    --default-artifact-root ${BUCKET_NAME} \
    --backend-store-uri mysql+pymysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_POST}/${DB_NAME}
