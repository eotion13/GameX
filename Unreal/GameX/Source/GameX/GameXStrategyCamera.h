#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "GameXStrategyCamera.generated.h"

/**
 * Strategy camera: pan, zoom, limited orbit/tilt.
 * Must never block gameplay; optional auto-frames are toggleable later.
 */
UCLASS()
class GAMEX_API AGameXStrategyCamera : public APawn
{
	GENERATED_BODY()

public:
	AGameXStrategyCamera();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX|Camera")
	float MinZoom = 800.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX|Camera")
	float MaxZoom = 4500.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX|Camera")
	float PitchMinDeg = 35.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX|Camera")
	float PitchMaxDeg = 70.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameX|Camera")
	bool bAllowAutoFraming = true;

protected:
	UPROPERTY(VisibleAnywhere, Category = "GameX")
	class USpringArmComponent* SpringArm;

	UPROPERTY(VisibleAnywhere, Category = "GameX")
	class UCameraComponent* Camera;
};
