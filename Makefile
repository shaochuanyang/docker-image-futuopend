.PHONY: build

export FUTU_VERSION=10.0.6008

# FutuOpenD could only be built as linux/amd64, or there will be an issue:
# Issue on Apple Silicon
# Ref: https://stackoverflow.com/questions/71040681/qemu-x86-64-could-not-open-lib64-ld-linux-x86-64-so-2-no-such-file-or-direc
build:
	DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build \
		--progress=plain \
		-t shaochuanyang123/moomoo_opend:$(FUTU_VERSION) \
		--build-arg FUTU_VERSION=$(FUTU_VERSION)_Centos7 \
		.

debug:
	docker run \
		--name FutuOpenD \
		--platform linux/amd64 \
		-it \
		-p 8083:8083 \
		-p 11111:11111 \
		-e "FUTU_LOGIN_ACCOUNT=$(FUTU_LOGIN_ACCOUNT)" \
		-e "FUTU_LOGIN_PWD=$(FUTU_LOGIN_PWD)" \
		-e "FUTU_LOGIN_PWD_MD5=$(FUTU_LOGIN_PWD_MD5)" \
		-e "FUTU_RSA_PRIVATE_KEY=$(FUTU_RSA_PRIVATE_KEY)" \
		-e "FUTU_LOG_LEVEL=$(FUTU_LOG_LEVEL)" \
		-e "SERVER_PORT=8083" \
		shaochuanyang123/moomoo_opend:$(FUTU_VERSION)


push:
	docker tag shaochuanyang123/moomoo_opend:$(FUTU_VERSION) shaochuanyang123/moomoo_opend:latest
	docker push shaochuanyang123/moomoo_opend:$(FUTU_VERSION)
	docker push shaochuanyang123/moomoo_opend:latest


.PHONY: build debug push
