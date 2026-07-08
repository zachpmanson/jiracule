self: { config, lib, pkgs, ... }:

let
  cfg = config.services.jiracule;
in {
  options.services.jiracule = {
    enable = lib.mkEnableOption "jiracule server";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      description = "The jiracule package to use.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port the app listens on.";
    };

    hostname = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Hostname/interface to bind. Use \"0.0.0.0\" to accept external traffic.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open `port` in the firewall.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/jiracule.env";
      description = ''
        Path to an environment file (systemd EnvironmentFile) holding the OAuth
        secrets, kept out of the Nix store:
          ATLASSIAN_CLIENT_ID=...
          ATLASSIAN_CLIENT_SECRET=...
          OAUTH_REDIRECT_URI=https://your-host/auth/callback
          SESSION_SECRET=...   # >= 32 random chars
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];

    systemd.services.jiracule = {
      description = "jiracule server";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      environment = {
        PORT = toString cfg.port;
        HOST = cfg.hostname;
        NODE_ENV = "production";
      };

      serviceConfig = {
        ExecStart = "${pkgs.nodejs_24}/bin/node ${cfg.package}/server/index.mjs";
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) cfg.environmentFile;
        DynamicUser = true;
        StateDirectory = "jiracule";
        WorkingDirectory = "/var/lib/jiracule";
        PrivateTmp = true;
        ProtectSystem = "strict";
        NoNewPrivileges = true;
        Restart = "on-failure";
        RestartSec = "5s";
      };
    };
  };
}
