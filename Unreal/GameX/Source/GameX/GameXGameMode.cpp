#include "GameXGameMode.h"
#include "GameXBoardActor.h"
#include "GameXStrategyCamera.h"

AGameXGameMode::AGameXGameMode()
{
	DefaultPawnClass = AGameXStrategyCamera::StaticClass();
	BoardClass = AGameXBoardActor::StaticClass();
}

void AGameXGameMode::BeginPlay()
{
	Super::BeginPlay();

	UWorld* World = GetWorld();
	if (!World || !BoardClass) return;

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	BoardActor = World->SpawnActor<AGameXBoardActor>(BoardClass, FVector::ZeroVector, FRotator::ZeroRotator, Params);
	if (BoardActor)
	{
		BoardActor->RebuildBoard(PlayerCount);
	}
}
