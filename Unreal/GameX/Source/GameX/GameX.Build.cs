using UnrealBuildTool;
using System.IO;

public class GameX : ModuleRules
{
	public GameX(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"UMG",
			"Slate",
			"SlateCore",
			"EnhancedInput"
		});

		// Portable rules library (no UE types) — relative to this module.
		string CoreRoot = Path.GetFullPath(Path.Combine(ModuleDirectory, "..", "..", "..", "..", "native", "GameXCore"));
		PublicIncludePaths.Add(Path.Combine(CoreRoot, "include"));
		// Sources are compiled into this module until a prebuilt static lib is wired in.
		PublicDefinitions.Add("GAMEX_WITH_NATIVE_CORE=1");
	}
}
