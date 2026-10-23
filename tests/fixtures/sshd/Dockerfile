# Servidor OpenSSH real para testes de integração (Princípio IV). Nunca usar fora de testes.
FROM alpine:3.22

RUN apk add --no-cache openssh-server-pam openssh-sftp-server socat linux-pam \
 && ssh-keygen -t ed25519 -N '' -f /etc/ssh/ssh_host_ed25519_key \
 && mkdir -p /etc/ssh/original \
 && cp /etc/ssh/ssh_host_ed25519_key /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/original/

COPY sshd_config /etc/ssh/sshd_config
COPY pam-sshd /etc/pam.d/sshd
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
