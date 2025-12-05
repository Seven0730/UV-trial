#include <igl/opengl/glfw/Viewer.h>
#include <igl/read_triangle_mesh.h>
#include <iostream>
#include "uv_unwrapping.h"
#include "xatlas_wrapper.h"

// 创建UV网格可视化
void visualize_uv_layout(
    const Eigen::MatrixXd& UV,
    const Eigen::MatrixXi& F,
    igl::opengl::glfw::Viewer& viewer
) {
    // 将UV坐标转换为3D坐标（z=0）
    Eigen::MatrixXd UV_3d(UV.rows(), 3);
    UV_3d.leftCols(2) = UV;
    UV_3d.col(2).setZero();
    
    // 设置UV平面网格
    viewer.data().set_mesh(UV_3d, F);
    viewer.data().set_colors(Eigen::RowVector3d(0.3, 0.7, 1.0));
    viewer.data().show_lines = true;
    viewer.data().line_width = 2.0f;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "用法: " << argv[0] << " <mesh.obj>" << std::endl;
        std::cout << "\n功能: 对比展示不同算法的UV展开效果" << std::endl;
        std::cout << "算法: LSCM, ABF, xatlas" << std::endl;
        return 1;
    }
    
    std::string mesh_file = argv[1];
    
    // 读取网格
    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    if (!igl::read_triangle_mesh(mesh_file, V, F)) {
        std::cerr << "无法读取网格: " << mesh_file << std::endl;
        return 1;
    }
    
    std::cout << "========================================" << std::endl;
    std::cout << "  UV 展开效果对比可视化" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "\n加载网格: " << V.rows() << " 顶点, " << F.rows() << " 面" << std::endl;
    
    // 执行不同算法
    std::cout << "\n[1/3] 运行 LSCM..." << std::endl;
    auto lscm_result = UVUnwrapping::unwrapLSCM(V, F);
    if (lscm_result.UV.rows() > 0) {
        std::cout << "  ✓ 成功 - 失真: " << lscm_result.distortion << std::endl;
    } else {
        std::cout << "  ✗ 失败（可能需要边界）" << std::endl;
    }
    
    std::cout << "\n[2/3] 运行 ABF..." << std::endl;
    auto abf_result = UVUnwrapping::unwrapABF(V, F, 50, 1e-4);
    if (abf_result.UV.rows() > 0) {
        std::cout << "  ✓ 成功 - 失真: " << abf_result.distortion << std::endl;
    } else {
        std::cout << "  ✗ 失败" << std::endl;
    }
    
    std::cout << "\n[3/3] 运行 xatlas..." << std::endl;
    UVUnwrapping::XAtlasWrapper wrapper;
    UVUnwrapping::XAtlasWrapper::Options options;
    options.resolution = 1024;
    options.padding = 2.0f;
    
    auto [xatlas_uv, xatlas_islands] = wrapper.generate(V, F, options);
    if (xatlas_uv.rows() > 0) {
        double xatlas_distortion = UVUnwrapping::computeUVDistortion(V, F, xatlas_uv);
        std::cout << "  ✓ 成功 - 失真: " << xatlas_distortion 
                  << ", UV岛: " << xatlas_islands.size() << std::endl;
    } else {
        std::cout << "  ✗ 失败" << std::endl;
    }
    
    // 创建可视化窗口
    igl::opengl::glfw::Viewer viewer;
    
    int current_view = 0;
    Eigen::MatrixXd current_UV;
    std::string current_method;
    
    auto update_view = [&]() {
        viewer.data().clear();
        
        switch(current_view) {
            case 0:
                if (lscm_result.UV.rows() > 0) {
                    current_UV = lscm_result.UV;
                    current_method = "LSCM";
                } else {
                    current_view = 1;
                    update_view();
                    return;
                }
                break;
            case 1:
                if (abf_result.UV.rows() > 0) {
                    current_UV = abf_result.UV;
                    current_method = "ABF";
                } else {
                    current_view = 2;
                    update_view();
                    return;
                }
                break;
            case 2:
                if (xatlas_uv.rows() > 0) {
                    current_UV = xatlas_uv;
                    current_method = "xatlas";
                } else {
                    current_view = 0;
                    update_view();
                    return;
                }
                break;
        }
        
        // 显示UV布局
        visualize_uv_layout(current_UV, F, viewer);
        
        std::cout << "\n当前显示: " << current_method << " UV展开" << std::endl;
    };
    
    // 键盘回调：切换不同算法
    viewer.callback_key_pressed = [&](igl::opengl::glfw::Viewer&, unsigned int key, int) {
        if (key == '1') {
            current_view = 0;
            update_view();
            return true;
        } else if (key == '2') {
            current_view = 1;
            update_view();
            return true;
        } else if (key == '3') {
            current_view = 2;
            update_view();
            return true;
        } else if (key == 'N' || key == 'n') {
            current_view = (current_view + 1) % 3;
            update_view();
            return true;
        }
        return false;
    };
    
    // 初始显示
    update_view();
    
    std::cout << "\n========================================" << std::endl;
    std::cout << "  可视化控制" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "按键:" << std::endl;
    std::cout << "  1 - 显示 LSCM 展开" << std::endl;
    std::cout << "  2 - 显示 ABF 展开" << std::endl;
    std::cout << "  3 - 显示 xatlas 展开" << std::endl;
    std::cout << "  N - 切换到下一个算法" << std::endl;
    std::cout << "\n鼠标:" << std::endl;
    std::cout << "  拖动 - 平移视图" << std::endl;
    std::cout << "  滚轮 - 缩放" << std::endl;
    std::cout << "========================================" << std::endl;
    
    viewer.core().background_color = Eigen::Vector4f(0.95, 0.95, 0.97, 1.0);
    viewer.core().orthographic = true;
    viewer.launch();
    
    return 0;
}
