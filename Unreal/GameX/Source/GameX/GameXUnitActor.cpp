#include "GameXUnitActor.h"

AGameXUnitActor::AGameXUnitActor()
{
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Root);
}

void AGameXUnitActor::PlayMoveVisual(const FVector& From, const FVector& To, float Duration)
{
	(void)From;
	(void)To;
	(void)Duration;
	// Timeline / lerp in presentation only — outcome already resolved.
}

void AGameXUnitActor::PlayDefeatVisual()
{
	// Short despawn; does not decide combat.
}
