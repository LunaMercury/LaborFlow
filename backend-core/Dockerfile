FROM eclipse-temurin:26-jdk AS build

WORKDIR /workspace
COPY backend-core ./backend-core
COPY database ./database

WORKDIR /workspace/backend-core
RUN chmod +x gradlew && ./gradlew --no-daemon --console=plain bootJar

FROM eclipse-temurin:26-jre

WORKDIR /app
RUN useradd --create-home --shell /usr/sbin/nologin laborflow
COPY --from=build /workspace/backend-core/build/libs/*.jar /app/app.jar

ENV SERVER_PORT=5581
EXPOSE 5581
USER laborflow

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
