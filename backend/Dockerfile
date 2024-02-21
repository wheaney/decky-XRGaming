# To run the build from the package root:
#    docker build -f ./backend/Dockerfile -t "decky" .
#    docker run --rm -i -v ./backend:/backend -v /tmp/output/decky-XRGaming/backend/out:/backend/out --entrypoint /backend/entrypoint.sh "decky"

FROM ghcr.io/steamdeckhomebrew/holo-base:latest

ENTRYPOINT [ "/backend/entrypoint.sh" ]