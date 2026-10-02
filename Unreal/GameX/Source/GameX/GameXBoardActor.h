#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameXBoardActor.generated.h"

class UStaticMeshComponent;
class UStaticMesh;

/**
 * Visual board from GameXCore layout. Presentation only.
 */
UCLASS()
class GAMEX_API AGameXBoardActor : public AActor
{
	GENERATED_BODY()

public:
	AGameXBoardActor();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX")
	float WorldScale = 400.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX")
	int32 PlayerCount = 3;

	/** Rebuild nodes/paths/sources from frozen GameXCore board rules. */
	UFUNCTION(BlueprintCallable, Category = "GameX")
	void RebuildBoard(int32 InPlayerCount = 3);

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;

protected:
	UPROPERTY(VisibleAnywhere, Category = "GameX")
	USceneComponent* Root;

	UPROPERTY(VisibleAnywhere, Category = "GameX")
	USceneComponent* NodesRoot;

	UPROPERTY(VisibleAnywhere, Category = "GameX")
	USceneComponent* PathsRoot;

	UPROPERTY(VisibleAnywhere, Category = "GameX")
	USceneComponent* SourcesRoot;

	UPROPERTY()
	UStaticMesh* CylinderMesh;

	UPROPERTY()
	UStaticMesh* CubeMesh;

	UPROPERTY()
	UStaticMesh* SphereMesh;

	void ClearVisuals();
	UStaticMeshComponent* AddMesh(USceneComponent* Parent, UStaticMesh* Mesh, const FVector& Loc, const FVector& Scale, const FRotator& Rot, const FLinearColor& Color);
};
