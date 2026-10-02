#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameXUnitActor.generated.h"

/** Visual unit placeholder. Type silhouette + player accent; no combat logic. */
UCLASS()
class GAMEX_API AGameXUnitActor : public AActor
{
	GENERATED_BODY()

public:
	AGameXUnitActor();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX")
	FString UnitId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX")
	FString UnitType; // reiter | bogen | schild

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX")
	FLinearColor AccentColor = FLinearColor::White;

	UFUNCTION(BlueprintCallable, Category = "GameX")
	void PlayMoveVisual(const FVector& From, const FVector& To, float Duration);

	UFUNCTION(BlueprintCallable, Category = "GameX")
	void PlayDefeatVisual();

protected:
	UPROPERTY(VisibleAnywhere, Category = "GameX")
	USceneComponent* Root;

	UPROPERTY(VisibleAnywhere, Category = "GameX")
	UStaticMeshComponent* Mesh;
};
