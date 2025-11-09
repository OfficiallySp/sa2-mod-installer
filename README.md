# SA2 Mod Installer

A Windows installer for Sonic Adventure 2 PC mods, inspired by the SADX Mod Installer. This tool automatically detects your SA2 installation, downloads and configures popular mods from GameBanana, and sets up the SA2 Mod Manager.

<details>

<summary>Included Mods</summary>

- [SASDL by Shaddatic](https://gamebanana.com/mods/615843)
- [Renderfix by Shaddatic](https://gamebanana.com/mods/452445)
- [Cutscene Revamp by SPEEPSHighway & End User](https://gamebanana.com/mods/48872)
- [HD GUI by SPEEPSHighway](https://gamebanana.com/mods/33171)
- [Chao World Extended by DarkyBenji & CWE Team](https://gamebanana.com/mods/48840)
- [Enhanced Chao World by Shaddatic](https://gamebanana.com/mods/48915)
- [Character Select Plus by Justin113D, MainMemory & SORA](https://gamebanana.com/mods/33170)
- [Volume Control by Shaddatic](https://gamebanana.com/mods/381193)
- [Input Fix by Shaddatic](https://gamebanana.com/mods/515637)

</details>


# Get Started
Download the latest release from the [Releases page](https://github.com/officiallysp/sa2-mod-installer/releases) and run the installer. 

Follow the on-screen setup to detect your SA2 install, select your desired mods, and complete the installation. No manual configuration is required for most users.

## Features

- **Automatic Game Detection**: Finds your SA2 installation automatically
- **GameBanana Integration**: Downloads mods directly from GameBanana
- **SA Mod Manager Integration**: Installs and configures the [SA Mod Manager](https://github.com/X-Hax/SA-Mod-Manager) ([credit](https://github.com/X-Hax/SA-Mod-Manager))
- **Recommended Mods**: Curated selection of the best starting SA2 mods (you can always install more)

## How It Works

1. **Game Detection**: Searches for SA2 in common Steam locations and Windows registry
2. **Mod Selection**: Shows each mod with preview and description in wizard style
3. **Download**: Fetches mods from GameBanana using their API
4. **Installation**: Extracts mods to the game's `mods` folder

## Troubleshooting

### Game Not Detected
- Make sure SA2 is installed
- Try using the "Browse" button to manually select the game folder
- Game folder should contain `sonic2app.exe` or `Sonic Adventure 2.exe`

### Download Failures
- Check internet connection

### Installation Issues
- Run the installer as Administrator if permission errors occur
- Make sure the game folder is not read-only
- Check available disk space
