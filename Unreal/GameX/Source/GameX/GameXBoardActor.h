#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameXBoardActor.generated.h"

/**
 * Visual board: nodes, paths, sources, bases.
 * Layout positions come from GameXCore board.x/y * WorldScale.
 * Does not own rules — only presentation.
 */
UCLASS()
class GAMEX_API AGameXBoardActor : public AActor
{
	GENERATED_BODY()

public:
	AGameXBoardActor();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX")
	float WorldScale = 400.f;

	UFUNCTION(BlueprintCallable, Category = "GameX")
	void RebuildFromMatch();

protected:
	UPROPERTY(VisibleAnywhere, Category = "GameX")
	USceneComponent* Root;

	UPROPERTY(VisibleAnywhere, Category = "GameX")
	USceneComponent* NodesRoot;

	UPROPERTY(VisibleAnywhere, Category = "GameX")
	USceneComponent* PathsRoot;
};
