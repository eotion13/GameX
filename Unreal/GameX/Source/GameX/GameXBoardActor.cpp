#include "GameXBoardActor.h"

AGameXBoardActor::AGameXBoardActor()
{
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	NodesRoot = CreateDefaultSubobject<USceneComponent>(TEXT("NodesRoot"));
	NodesRoot->SetupAttachment(Root);
	PathsRoot = CreateDefaultSubobject<USceneComponent>(TEXT("PathsRoot"));
	PathsRoot->SetupAttachment(Root);
}

void AGameXBoardActor::RebuildFromMatch()
{
	// Spawn node markers / path meshes from native board when UE links GameXCore.
}
