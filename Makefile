.PHONY: deploy

# Deploy the latest committed jiracule to the naboo NixOS host.
# Pushes the current branch (so the flake input can resolve the new commit),
# then on the server bumps the jiracule flake input and rebuilds.
deploy:
	git push origin HEAD
	ssh nc 'cd nixos-config && nix flake lock --update-input jiracule && rebuild'
