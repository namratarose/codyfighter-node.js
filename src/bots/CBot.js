import CBotConfig from "./modules/CBotConfig.js";
import GameUtils from "./modules/GameUtils.js";
import { GAME_STATUS_PLAYING } from "../modules/game-constants.js";

// CBot class is the main class for the bot.
// The bot algorithm is implemented in the playGame() method.
// Check the API documentation at https://codyfight.com/api-doc/.

export default class CBot extends CBotConfig {
  constructor(app, url, ckey, mode, i, isDev = false) {
    super(app, url, ckey, mode, i, isDev);

    this.gameUtils = new GameUtils();
    this.strategy = "ryo";
  }

  // Main game loop
  async playGame() {
    if (!this.game) return await this.run();

    while (this.game.state.status === GAME_STATUS_PLAYING) {
      if (this.game.players.bearer.is_player_turn) {
        await this.castSkills();
        await this.makeMove();
      } else {
        this.game = await this.gameAPI.check(this.ckey);
      }
    }
  }

  async makeMove() {
    if (this.game.players.bearer.is_player_turn) {
      let move = this.gameUtils.getRandomMove(this.game);

      const ryo = this.gameUtils.findSpecialAgent(1, this.game);
      const ripper = this.gameUtils.findSpecialAgent(4, this.game);
      const buzz = this.gameUtils.findSpecialAgent(5, this.game);

      const exit = this.gameUtils.getClosestExit(this.game);

      const opponentClass = this.game?.players?.opponent?.codyfighter?.class;

      const isHunter = opponentClass === "HUNTER";

      const isOpponentNearby = this.gameUtils.isNearby(
        this.game?.players?.bearer?.position,
        this.game?.players?.opponent?.position,
        2
      );

      const isRipperNearby = this.gameUtils.isNearby(
        this.game.players.bearer?.position,
        ripper?.position,
        3
      );

      const isRyoCloser = this.gameUtils.isCloser(
        this.game?.players?.bearer?.position,
        ryo?.position,
        exit
      );

      const avoidRipper = () => {
        move = this.gameUtils.getFarthestDistanceMove(
          ripper?.position,
          this.game
        );

        console.log(`${this.getBotName()} - 💀 Avoiding Ripper`);
      };

      const avoidOpponent = () => {
        move = this.gameUtils.getFarthestDistanceMove(
          [this.game.players.opponent.position],
          this.game
        );

        console.log(`${this.getBotName()} - 💀 Avoiding Ripper`);
      };


      const goToExit = () => {
        move = this.gameUtils.getShortestDistanceMove([exit], this.game);

        console.log(`${this.getBotName()} - ❎ Finding Exit`);
      };

      const goToRyo = () => {
        move = this.gameUtils.getShortestDistanceMove(
          [ryo?.position],
          this.game
        );

        console.log(`${this.getBotName()} - 🐽 Seeking Ryo`);
      };

      const chaseOpponent = () => {
        move = this.gameUtils.getShortestDistanceMove(
          [this.game.players.opponent.position],
          this.game
        );

        console.log(`${this.getBotName()} - ⚔ Chasing opponent`);
      };

      const stay = () => {
        move = this.gameUtils.getShortestDistanceMove(
          [this.game.players.bearer.position],
          this.game
        );

        console.log(`${this.getBotName()} - 🏖 Just chilling`);
      };


      if (exit) {
        this.strategy = "exit";

        goToExit();

        return (this.game = await this.gameAPI.move(
          this.ckey,
          move?.x,
          move?.y
        ));
      }

      if (isRyoCloser) {
        this.strategy = "ryo";

        goToRyo();

        return (this.game = await this.gameAPI.move(
          this.ckey,
          move?.x,
          move?.y
        ));
      }

      if (ryo && buzz) {
        this.strategy = "ryo";

        goToRyo();

        return (this.game = await this.gameAPI.move(
          this.ckey,
          move?.x,
          move?.y
        ));
      }


      if (ripper && isRipperNearby) {
        this.strategy = "ripper"

        avoidRipper();

        return (this.game = await this.gameAPI.move(
          this.ckey,
          move?.x,
          move?.y
        ));

      }

      
      if (isHunter && !isOpponentNearby) {
        this.strategy = "exit"

        avoidOpponent();

        return (this.game = await this.gameAPI.move(
          this.ckey,
          move?.x,
          move?.y
        ));
      }

      if (!isHunter) {
        this.strategy = "hunter";

        chaseOpponent();

        return (this.game = await this.gameAPI.move(
          this.ckey,
          move?.x,
          move?.y
        ));
      }
    

      this.strategy = "stay";

      stay();

      return (this.game = await this.gameAPI.move(this.ckey, move?.x, move?.y));
    }
  }

  async castSkills() {
    if (!this.game?.players?.bearer?.is_player_turn) return;

    for (const skill of this.game.players.bearer.skills) {
      const hasEnoughEnergy =
        skill.cost <= this.game.players.bearer.stats.energy;

      if (
        skill.status !== 1 ||
        skill.possible_targets.length === 0 ||
        !hasEnoughEnergy
      )
        continue;

      const exitPos = this.gameUtils.getClosestExit(this.game);
      const ryoPos = this.gameUtils.findSpecialAgent(1, this.game)?.position;
      const ripperPos = this.gameUtils.findSpecialAgent(4, this.game)?.position;
      const opponentPos = this.game?.players?.opponent?.position;

      const pitHoles = this.gameUtils.findPits(this.game);

      const possibleTargets = skill.possible_targets.filter((target) => {
        // Cast Build skill only on top of pit holes
        if (skill?.id === 1) {
          return pitHoles.some(
            (hole) => hole.x === target.x && hole.y === target.y
          );
        }

        if (skill?.damage) {
          // Cast damage skill only on opponent
          return target.x === opponentPos?.x && target.y === opponentPos?.y;
        }

        return !pitHoles.some(
          (hole) => hole.x === target.x && hole.y === target.y
        );
      });

      if (!possibleTargets) continue;

      let bestTarget;

      switch (this.strategy) {
        case "exit":
          bestTarget = this.gameUtils.getTargetPosition(
            possibleTargets,
            exitPos
          );
          break;

        case "ryo":
          bestTarget = this.gameUtils.getTargetPosition(
            possibleTargets,
            ryoPos
          );
          break;

        case "ripper":
          bestTarget = this.gameUtils.getTargetPosition(
            possibleTargets,
            ripperPos,
            false
          );
          break;

        case "hunter":
          bestTarget = this.gameUtils.getTargetPosition(
            possibleTargets,
            opponentPos,
            true
          );
          break;

        case "stay":
          bestTarget = null;

        default:
          bestTarget = null;
      }

      const target = bestTarget;

      if (!target) continue;

      if (
        skill.possible_targets.some(
          (t) => t.x === target?.x && t.y === target?.y
        )
      ) {
        this.game = await this.gameAPI.cast(
          this.ckey,
          skill.id,
          target?.x,
          target?.y
        );

        console.log(
          `${this.getBotName()} - ⚡️ Casting ${skill.name} - id: ${skill?.id}`
        );
      }

      await this.castSkills();
      break;
    }
  }
}
