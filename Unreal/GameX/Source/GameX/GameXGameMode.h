#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameXGameMode.generated.h"

class AGameXBoardActor;

/**
 * Presentation game mode. Owns match flow; never invents combat outcomes.
 */
UCLASS()
class GAMEX_API AGameXGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AGameXGameMode();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX")
	int32 PlayerCount = 3;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX")
	TSubclassOf<AGameXBoardActor> BoardClass;

protected:
	virtual void BeginPlay() override;

	UPROPERTY()
	AGameXBoardActor* BoardActor = nullptr;
};
