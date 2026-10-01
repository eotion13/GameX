#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameXGameMode.generated.h"

/**
 * Presentation game mode. Owns match flow; never invents combat outcomes.
 * Core resolve will be called from C++ match controller once UE is available.
 */
UCLASS()
class GAMEX_API AGameXGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AGameXGameMode();
};
