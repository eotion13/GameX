#include "GameXBoardActor.h"

#include "Containers/Set.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

#if GAMEX_WITH_NATIVE_CORE
#include "GameX/Board.hpp"
#include "GameX/Rules.hpp"
#endif

AGameXBoardActor::AGameXBoardActor()
{
	PrimaryActorTick.bCanEverTick = false;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	NodesRoot = CreateDefaultSubobject<USceneComponent>(TEXT("NodesRoot"));
	NodesRoot->SetupAttachment(Root);
	PathsRoot = CreateDefaultSubobject<USceneComponent>(TEXT("PathsRoot"));
	PathsRoot->SetupAttachment(Root);
	SourcesRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SourcesRoot"));
	SourcesRoot->SetupAttachment(Root);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cyl(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	if (Cyl.Succeeded()) CylinderMesh = Cyl.Object;
	if (Cube.Succeeded()) CubeMesh = Cube.Object;
	if (Sphere.Succeeded()) SphereMesh = Sphere.Object;
}

void AGameXBoardActor::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	RebuildBoard(PlayerCount);
}

void AGameXBoardActor::BeginPlay()
{
	Super::BeginPlay();
	RebuildBoard(PlayerCount);
}

void AGameXBoardActor::ClearVisuals()
{
	TArray<USceneComponent*> Roots = { NodesRoot, PathsRoot, SourcesRoot };
	for (USceneComponent* R : Roots)
	{
		if (!R) continue;
		TArray<USceneComponent*> Children;
		R->GetChildrenComponents(true, Children);
		for (USceneComponent* Child : Children)
		{
			if (Child) Child->DestroyComponent();
		}
	}
}

UStaticMeshComponent* AGameXBoardActor::AddMesh(
	USceneComponent* Parent,
	UStaticMesh* Mesh,
	const FVector& Loc,
	const FVector& Scale,
	const FRotator& Rot,
	const FLinearColor& Color)
{
	if (!Parent || !Mesh) return nullptr;
	UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(this);
	Comp->SetupAttachment(Parent);
	Comp->SetStaticMesh(Mesh);
	Comp->SetRelativeLocation(Loc);
	Comp->SetRelativeRotation(Rot);
	Comp->SetRelativeScale3D(Scale);
	Comp->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Comp->SetGenerateOverlapEvents(false);
	Comp->RegisterComponent();

	if (UMaterialInterface* BaseMat = Comp->GetMaterial(0))
	{
		if (UMaterialInstanceDynamic* Dyn = Comp->CreateDynamicMaterialInstance(0, BaseMat))
		{
			Dyn->SetVectorParameterValue(TEXT("Color"), Color);
			// BasicShapes often use "BaseColor"
			Dyn->SetVectorParameterValue(TEXT("BaseColor"), Color);
		}
	}
	return Comp;
}

void AGameXBoardActor::RebuildBoard(int32 InPlayerCount)
{
	PlayerCount = FMath::Clamp(InPlayerCount, 2, 6);
	ClearVisuals();

#if !GAMEX_WITH_NATIVE_CORE
	return;
#else
	try
	{
		const gamex::Board Board = gamex::createBoard(PlayerCount, gamex::Config{});
		TSet<FString> Drawn;

		const FLinearColor PathColor(0.35f, 0.32f, 0.28f);
		const FLinearColor NodeColor(0.25f, 0.28f, 0.34f);
		const FLinearColor SourceColor(0.55f, 0.48f, 0.28f);
		const FLinearColor WaterColor(0.25f, 0.45f, 0.55f);

		for (const std::string& Id : Board.order)
		{
			const gamex::Node& A = Board.nodes.at(Id);
			for (const std::string& Nb : A.neighbors)
			{
				const FString Key = (Id < Nb)
					? FString(Id.c_str()) + TEXT("|") + FString(Nb.c_str())
					: FString(Nb.c_str()) + TEXT("|") + FString(Id.c_str());
				if (Drawn.Contains(Key)) continue;
				Drawn.Add(Key);

				const gamex::Node& B = Board.nodes.at(Nb);
				const FVector PA(A.x * WorldScale, A.y * WorldScale, 2.f);
				const FVector PB(B.x * WorldScale, B.y * WorldScale, 2.f);
				const FVector Mid = (PA + PB) * 0.5f;
				const FVector Delta = PB - PA;
				const float Len = Delta.Size();
				const FRotator Rot = Delta.Rotation();
				AddMesh(
					PathsRoot,
					CubeMesh,
					Mid,
					FVector(Len / 100.f, 0.12f, 0.04f),
					Rot,
					PathColor);
			}
		}

		for (const std::string& Id : Board.order)
		{
			const gamex::Node& N = Board.nodes.at(Id);
			const FVector Loc(N.x * WorldScale, N.y * WorldScale, 8.f);
			const bool bSource = N.isSource;
			AddMesh(
				NodesRoot,
				CylinderMesh,
				Loc,
				FVector(0.55f, 0.55f, 0.08f),
				FRotator::ZeroRotator,
				bSource ? SourceColor : NodeColor);

			if (bSource)
			{
				AddMesh(
					SourcesRoot,
					CylinderMesh,
					Loc + FVector(0, 0, 18.f),
					FVector(0.35f, 0.35f, 0.12f),
					FRotator::ZeroRotator,
					SourceColor);
				AddMesh(
					SourcesRoot,
					SphereMesh,
					Loc + FVector(0, 0, 28.f),
					FVector(0.22f),
					FRotator::ZeroRotator,
					WaterColor);
			}

			if (N.base.has_value())
			{
				const int32 P = *N.base;
				const FLinearColor Accent = FLinearColor::MakeFromHSV8(
					static_cast<uint8>((P * 47) % 255), 180, 220);
				AddMesh(
					NodesRoot,
					CubeMesh,
					Loc + FVector(0, 0, -6.f),
					FVector(0.85f, 0.85f, 0.06f),
					FRotator::ZeroRotator,
					Accent);
			}
		}
	}
	catch (...)
	{
		UE_LOG(LogTemp, Error, TEXT("GameXBoardActor: createBoard failed"));
	}
#endif
}
